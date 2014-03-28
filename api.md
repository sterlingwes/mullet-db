Schema

****

createSchema - factory for collection objects

- name, name of collection
- spec, object literal with fields key defining collection item structure

returns a NewSchema prototype

****

NewSchema - prototype for our new collection

- val, object with fields / values for new item in collection

TODO: get rid of existing flag, rely on existence of _id / id as in Schema.save()

****

external API of DB app